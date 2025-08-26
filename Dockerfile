FROM ghcr.io/puppeteer/puppeteer:22.12.1
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV NODE_ENV=production
ENV RENDER_PDF_TOKEN=${RENDER_PDF_TOKEN}
EXPOSE 8080
CMD ["node", "server.js"]
