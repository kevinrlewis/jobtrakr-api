#!/bin/bash
# export PATH=$PATH:/home/ec2-user/.nvm/versions/node/v10.15.3/bin/pm2

cd /var/jobtrakr-api
sh pm2 restart ecosystem.config.js --env production
