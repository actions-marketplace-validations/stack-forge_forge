FROM node:12.13.0

RUN apt update -qq
RUN apt upgrade -y -qq
RUN apt install software-properties-common -y
RUN curl -fsSL https://apt.releases.hashicorp.com/gpg | apt-key add -
RUN apt install software-properties-common -y -qq
RUN apt-add-repository "deb [arch=amd64] https://apt.releases.hashicorp.com $(lsb_release -cs) main"
RUN apt install apt-transport-https -y -qq
RUN apt update -qq
RUN apt install terraform

WORKDIR /github/workspace/

COPY . .

ENTRYPOINT [ "node", "dist" ]