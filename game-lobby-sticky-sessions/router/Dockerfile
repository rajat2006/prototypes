FROM openresty/openresty:alpine

COPY router/nginx.conf /usr/local/openresty/nginx/conf/nginx.conf

COPY router/lua/ /usr/local/openresty/nginx/lua/

COPY client/ /usr/local/openresty/nginx/html/

EXPOSE 4000