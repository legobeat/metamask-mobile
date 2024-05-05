FROM node:20-alpine
RUN apk update; apk add --no-cache \
  bash git curl jq \
  build-base ccache cmake \
  ruby ruby-dev
#RUN gem install bigdecimal etc
RUN gem install bigdecimal
RUN gem install cocoapods
RUN echo 'corepack enable' | tee -a /home/node/.bashrc | tee -a /home/node/.ashrc && chsh node
