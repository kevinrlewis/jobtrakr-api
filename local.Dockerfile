# STEP 1 build static website
FROM node:alpine as builder
RUN apk update && apk add --no-cache git
RUN apk add --no-cache --virtual .gyp \
        python2 \
        python \
        make \
        g++ \
    && apk del .gyp
RUN export PATH="$PATH:/usr/local/bin/python"

# Create app directory
WORKDIR /usr/src/app
RUN ls
# Install app dependencies
COPY jobtrakr-api/package*.json ./
COPY aws_cred.json .
COPY db_config.json .
COPY j-jwtRS256.key .
COPY j2-jwtRS256.key.pub .

RUN ls
RUN npm set progress=false && npm install
RUN ls /usr/src/app
# Copy project files into the docker image
COPY ./jobtrakr-api .

RUN ls /usr/src/app

EXPOSE 3000

CMD [ "npm", "start" ]
