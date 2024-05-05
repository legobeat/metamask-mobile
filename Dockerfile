FROM node:20-alpine
RUN apk update && apk add --no-cache \
  bash git curl jq \
  shadow sudo \
  build-base ccache cmake musl-dev linux-headers \
  ruby ruby-dev
#RUN gem install bigdecimal etc
RUN gem install bigdecimal
RUN gem install cocoapods
ARG YARN_VERSION=1.22.22
#RUN npm i -g --force yarn@$YARN_VERSION
RUN npm i -g --force yarn@1.22.22
#RUN echo 'corepack enable' | tee -a /home/node/.bashrc | tee -a /home/node/.ashrc && chsh -s /bin/bash node
