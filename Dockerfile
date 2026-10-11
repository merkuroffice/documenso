# Documenso with our German: the upstream image, its German texts addressing
# people as "Sie" rather than "du", and the few texts customers would otherwise
# meet in English. See translations/de.json and scripts/apply-translations.mjs.
#
# The version lives here and nowhere else. The workflow reads it from this file
# to tag the image, so the tag in ECR always names the Documenso release inside
# it. Pinned to the exact release and its digest, like every other image here.
ARG DOCUMENSO_VERSION=v2.20.0
ARG DOCUMENSO_DIGEST=sha256:05d2ede9fb87bfd8eedc11d81b8bdee43c3e775ea46c4fb64973153ca5ef8eb8

FROM documenso/documenso:${DOCUMENSO_VERSION}@${DOCUMENSO_DIGEST}

# Written as the image's own user, so the files keep their owner.
COPY --chown=nodejs:nogroup translations/de.json scripts/apply-translations.mjs /tmp/translations/
RUN cd /app && node /tmp/translations/apply-translations.mjs /app/apps/remix/build /tmp/translations/de.json \
 && rm -rf /tmp/translations
