#!/bin/bash
cd /var/jobtrakr-api
sh npm install -g pm2
sh pm2 restart ecosystem.config.js --env production
