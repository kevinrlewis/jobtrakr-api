# STEP 2 build a small nginx image with static website
FROM nginx:alpine

# replace nginx conf file
RUN rm /etc/nginx/conf.d/default.conf
COPY server/jobtrak/api.conf /etc/nginx/conf.d/default.conf

# expose port 8080
EXPOSE 8080

# run image command
CMD ["nginx", "-g", "daemon off;"]
