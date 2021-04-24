FROM stackforg3/clis

COPY . /

ENTRYPOINT [ "node", "/dist" ]