# The image for rbagents-shared-instruction.
#
# This image has never been built by the change that added it. Docker was not
# available where it was written, so every instruction below is reviewed source
# and not a verified build. See wiki/environments/docker.md.

FROM node:22-alpine

WORKDIR /srv

# Dependencies first, so a change to src/ or content/ does not re-resolve the
# tree. --omit=dev is doing nothing today - this package declares no
# devDependencies - and is kept because it is the right flag, and because a test
# dependency added later would otherwise land in the image.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --omit=dev

COPY src ./src

# The served set, copied verbatim. .gitattributes pins eol=lf so a Windows checkout
# cannot put CRLF into the bytes this image serves, and the image reproduces across
# hosts. Nothing writes to content/ in the image, and nothing does in the running
# server.
COPY content ./content

# src/index.js defaults PORT to 3000, so this is a statement about code that
# already existed rather than a new promise.
EXPOSE 3000

# Nothing after this needs root. The files above are readable by every user.
USER node

# The transport is selected by MCP_TRANSPORT, not by a second entry point:
# src/index.js is stdio unless the variable says otherwise, which is why this
# image does not serve HTTP by itself.
#
#   stdio   docker run --rm -i rbagents-shared-instruction
#   http    docker run --rm -p 3000:3000 \
#             -e MCP_TRANSPORT=http rbagents-shared-instruction
#
# Over HTTP the routes are GET /healthz and POST /mcp, and the server binds
# 0.0.0.0 by default - set HOST=127.0.0.1 to bind loopback only, and set
# MCP_ALLOWED_HOSTS to a comma-separated Host allow-list. The allow-list is off
# when the variable is unset, and the server says so on stderr at startup.
# See wiki/environments/env.md.
ENTRYPOINT ["node", "src/index.js"]
