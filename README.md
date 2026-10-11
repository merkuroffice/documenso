# Documenso for MerkurOffice

The e-signature server that replaces SignWell (sign.merkuroffice.de, its preview
sign-preview.merkuroffice.de), as an image of our own: the upstream release with
its German texts addressing people as "Sie", as every other text MerkurOffice
sends customers does. Upstream's German says "du" in about a hundred places, the
invitation to sign among them, and has a few texts in English only.

Nothing else is changed. The stack that runs it is `stacks/documenso.yml` in
merkuroffice/terraform; how contracts reach it is `src/services/contracts/documenso.js`
in merkuroffice/open-api.

## What is in here

```
Dockerfile                        the upstream release, pinned by digest, plus the texts
translations/de.json              our German, one entry per text
scripts/apply-translations.mjs    writes it into Documenso's compiled catalogs
texts.version                     the fourth part of the image tag
compose.yml                       Documenso built from here, for a laptop
```

## How the texts get in

Documenso ships its translations compiled into the build, as JSON with Lingui's
message IDs as keys: one catalog for the browser, one for the server, one for
the part that renders the mails. `apply-translations.mjs` runs while the image
is built and replaces our texts in all of them. The ID is a hash of the English
text, so an entry names the English and the script computes the ID.

Every entry carries the German it replaces:

```json
{
  "en": "Continue by signing the document.",
  "was": "Fahre fort, indem du das Dokument signierst.",
  "de": "Fahren Sie fort, indem Sie das Dokument unterschreiben."
}
```

If the catalog no longer holds what `was` says, Documenso has changed that text,
and the build stops instead of overwriting something nobody has looked at. An
empty `was` stands for a text that had no German yet. `context` is Lingui's
context, where upstream gives one.

A few entries move the document name: "{inviterName} has invited you to sign
"{documentName}"" becomes "{inviterName} bittet Sie, „{documentName}“ zu
unterschreiben", because the action verb comes as an infinitive and only fits
at the end of a German sentence.

What is not a text is not here: the footer with Documenso's address goes once
the team has its branding switched on (Settings, Branding, with the company
details), and "This document was sent using Documenso" with "Hide powered by".

## Updating Documenso

1. Raise `DOCUMENSO_VERSION` and `DOCUMENSO_DIGEST` in the Dockerfile.
2. `docker build .` and read what stops it: every entry whose `was` no longer
   matches. Look at the new upstream German and write `de` and `was` again.
3. Look for new texts that say "du" in the release's
   `apps/remix/build/server/hono/packages/lib/translations/de/web.po`.
4. `docker compose up --build`, send yourself a document, read the mails in
   Mailpit and the signing page.
5. Raise `texts.version` back to 1 for the new release, or by one for a change
   of the texts alone, and merge.

## Releases

A push to `main` builds the image and pushes it to ECR as
`merkuroffice/documenso:<release>.<texts.version>`, e.g. `2.20.0.1`, and moves
`latest`. A tag that exists already stops the build, so raising
`texts.version` is part of every change to the image. The stack pins the tag it
runs; moving production is a change in merkuroffice/terraform.

Pull requests build the image without pushing it, which is where a text that no
longer matches shows up first.

## Licence

Documenso is AGPL-3.0. A changed version that people use over the network has
to offer them its source; what we change is this repository.
