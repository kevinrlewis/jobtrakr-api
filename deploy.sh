#!/bin/bash
cd /var/jobtrakr-api
sudo -u ec2-user pm2 restart index.js
