FROM node:20-alpine
RUN apk add --no-cache docker-cli docker-compose
WORKDIR /app
COPY package.json .
RUN npm install
COPY server.js .
RUN mkdir -p /app/public
COPY src/index.html /app/public/index.html
COPY src/student_session.html /app/public/student_session.html
COPY src/classroom_replay.html /app/public/classroom_replay.html
COPY fake_shell.js .
ENV LABS_ROOT=/labs
ENV OLLAMA_URL=http://host.docker.internal:11434
ENV OLLAMA_URL_FALLBACKS=http://host.docker.internal:11434,http://172.17.0.1:11434,http://localhost:11434
ENV LABFORGE_CLASSROOM=true
ENV PORT=4000
EXPOSE 4000
CMD ["node","server.js"]
