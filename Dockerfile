FROM node:6

RUN mkdir -p /usr/src/app/lib
WORKDIR /usr/src/app

ARG NODE_ENV
ENV NODE_ENV $NODE_ENV
COPY package.json /usr/src/app/
RUN npm install && npm cache clean --force
COPY index.js /usr/src/app
COPY bot.yml /usr/src/app

COPY libs/* /usr/src/app/lib/

#Secrets must be provided via command line args
CMD CLIENT_ID=$CLIENT_ID \
CLIENT_SECRET=$CLIENT_SECRET \
GITLAB_TOKEN=$GITLAB_TOKEN \
PORT=8080 \
npm start

