const core = require('@actions/core')
const glob = require('@actions/glob')
const axios = require('axios').default
const FormData = require('form-data')
const targz = require('targz')
const fs = require('fs-extra')
const { promisify } = require('util')
const { exec } = require('child_process')

const decompress = promisify(targz.decompress)

async function run () {
  try {
    // Get inputs
    const configFilePath = core.getInput('config_file', { required: true })
    const apiKey = core.getInput('api_key', { required: true })
    const stage = core.getInput('stage', { required: true })

    const globber = await glob.create(configFilePath)
    const [configFile] = await globber.glob()

    const form = new FormData()
    form.append('configFile', fs.createReadStream(configFile))
    form.append('apiKey', apiKey)
    form.append('stage', stage)

    const outFile = 'output.tgz'
    const writer = fs.createWriteStream(outFile)
    await axios
      .post('https://api.stackforge.tech/v1/transform', form, {
        responseType: 'stream',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': `multipart/form-data; boundary=${form._boundary}`
        }
      })
      .then(res => {
        res.data.pipe(writer)
        let error = null
        return new Promise((resolve, reject) => {
          writer.on('error', err => {
            error = err
            writer.close()
            reject(err)
          })
          writer.on('close', () => {
            if (!error) {
              resolve(true)
            }
          })
        })
      })

    const cwd = './out'
    await decompress({
      src: outFile,
      dest: cwd
    })

    await new Promise((resolve, reject) => {
      const defaultCb = cb => async (err, stdout, stderr) => {
        if (err || stderr) {
          console.error(stderr)
          await Promise.all([fs.remove(cwd), fs.remove(outFile)])
          return reject(err || Error(stderr))
        }
        console.log(stdout)
        cb()
      }

      exec(`terraform workspace new ${stage}`, { cwd }, () =>
        exec(`terraform workspace select ${stage}`, { cwd }, () =>
          exec(
            'terraform init',
            { cwd },
            defaultCb(() =>
              exec(
                'terraform plan -out tf-plan',
                { cwd },
                defaultCb(() =>
                  exec(
                    'terraform apply -auto-approve tf-plan',
                    { cwd },
                    defaultCb(async () => {
                      exec(
                        'terraform output -json',
                        { cwd },
                        async (err, stdout, stderr) => {
                          if (err || stderr) {
                            console.error(stderr)
                            await Promise.all([fs.remove(cwd), fs.remove(outFile)])
                            return reject(err || Error(stderr))
                          }
                          core.setCommandEcho(`::set-env name=STACKFORGE_OUTPUTS::{${JSON.stringify(stdout)}}`)
                        }
                      )
                    })
                  )
                )
              )
            )
          )
        )
      )
    })
    console.log('Finished forging!')
  } catch (error) {
    console.error(error)
    core.setFailed(error.message)
  }
}

module.exports = run

if (require.main === module) {
  run()
}
