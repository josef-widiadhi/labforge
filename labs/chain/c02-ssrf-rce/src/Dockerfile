FROM node:20-alpine
WORKDIR /app
RUN echo '{"dependencies":{"express":"^4.18.2"}}' > package.json && npm install
COPY web.js .
COPY internal.js .
# Start both: web on 3000, internal on 3001
CMD ["sh","-c","node web.js & node internal.js"]
