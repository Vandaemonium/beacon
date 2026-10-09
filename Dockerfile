# Beacon server image. Built on Sol by compose (build context = this repo).
FROM node:24-alpine

WORKDIR /app
COPY server/package.json server/
COPY server/src server/src
COPY web web
COPY extension extension

ENV NODE_ENV=production PORT=8796 DATA_DIR=/data WEB_DIR=/app/web/ APP_DIR=/app/extension/
USER node
EXPOSE 8796
HEALTHCHECK --interval=60s --timeout=5s CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/src/main.js"]
