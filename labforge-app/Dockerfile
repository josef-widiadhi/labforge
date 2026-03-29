FROM node:20-alpine
RUN apk add --no-cache docker-cli docker-compose
WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .
RUN mkdir -p /app/public
COPY src/index.html /app/public/index.html
ENV LABS_ROOT=/labs
ENV OLLAMA_URL=http://host.docker.internal:11434
ENV PORT=4000
EXPOSE 4000
CMD ["node","server.js"]
