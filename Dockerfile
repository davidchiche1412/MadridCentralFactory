FROM node:26.13.1-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.js ./

USER node
EXPOSE 3001
CMD ["node", "app.js"]
