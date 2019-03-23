#!/bin/bash
export PATH=$PATH:/home/ec2-user/.nvm/versions/node/v10.15.3/bin/pm2

cd /var/jobtrakr-api
sudo pm2 restart index.js
