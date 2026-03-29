FROM node:20-alpine
RUN apk add --no-cache bash python3
WORKDIR /app
COPY package.json .
RUN npm install
COPY app.js .
CMD ["node", "app.js"]
