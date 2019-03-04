# docker build --no-cache -t jobtrakr-api -f ./jobtrakr-api/Dockerfile .

# STEP 1 build static website
# install initial environment reqs
FROM node:alpine as builder
RUN apk update && apk add --no-cache git
RUN apk add --no-cache --virtual .gyp \
        python2 \
        python \
        make \
        g++ \
    && apk del .gyp
RUN export PATH="$PATH:/usr/local/bin/python"

# set environmental variables
ENV NODE_ENV=prod

# create app directory
WORKDIR /usr/src/app
RUN ls

# copy required files
COPY jobtrakr-api/package*.json ./
COPY aws_cred.json .
COPY db_config.json .
COPY j-jwtRS256.key .
COPY j2-jwtRS256.key.pub .
RUN ls

# install dependencies
RUN npm set progress=false && npm install
RUN ls /usr/src/app

# copy project files into the docker image
COPY ./jobtrakr-api .
RUN ls .

# expose port 3000
EXPOSE 3000

# command to run image
CMD [ "npm", "start" ]
