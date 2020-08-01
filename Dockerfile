FROM node:12.18-alpine as build

WORKDIR /app
COPY package*.json /app/
COPY yarn.lock /app/
RUN yarn install

COPY ./ /app/

RUN yarn run build

FROM nginx:1.18.0-alpine

COPY --from=build /app/build /usr/share/nginx/html
COPY --from=build /app/nginx/nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

ENTRYPOINT [ "nginx", "-g", "daemon off;" ]
