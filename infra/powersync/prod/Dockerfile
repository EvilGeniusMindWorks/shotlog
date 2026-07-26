# PowerSync service for Railway. Railway can't mount config files into a
# public image, so we bake them in. Deploy this directory as a Railway
# service (root directory: infra/powersync/prod).
FROM journeyapps/powersync-service:latest
COPY service.yaml /config/service.yaml
COPY sync_rules.yaml /config/sync_rules.yaml
ENV POWERSYNC_CONFIG_PATH=/config/service.yaml
CMD ["start", "-r", "unified"]
