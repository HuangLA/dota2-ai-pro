const fs = require('fs');

function readNullTerminatedString(buffer, cursor) {
  let end = cursor.offset;

  while (end < buffer.length && buffer[end] !== 0) {
    end += 1;
  }

  if (end >= buffer.length) {
    throw new Error('Unexpected end of VPK directory while reading string');
  }

  const value = buffer.toString('utf8', cursor.offset, end);
  cursor.offset = end + 1;
  return value;
}

function readUInt32(buffer, cursor) {
  const value = buffer.readUInt32LE(cursor.offset);
  cursor.offset += 4;
  return value;
}

function readUInt16(buffer, cursor) {
  const value = buffer.readUInt16LE(cursor.offset);
  cursor.offset += 2;
  return value;
}

function parseVpkDirectory(vpkPath) {
  const buffer = fs.readFileSync(vpkPath);
  const cursor = { offset: 0 };

  const signature = readUInt32(buffer, cursor);
  const version = readUInt32(buffer, cursor);
  const treeSize = readUInt32(buffer, cursor);

  if (signature !== 0x55aa1234) {
    throw new Error(`Unsupported VPK signature: 0x${signature.toString(16)}`);
  }

  if (version === 2) {
    readUInt32(buffer, cursor);
    readUInt32(buffer, cursor);
    readUInt32(buffer, cursor);
    readUInt32(buffer, cursor);
  }

  const entries = [];

  while (true) {
    const extension = readNullTerminatedString(buffer, cursor);
    if (!extension) {
      break;
    }

    while (true) {
      const directory = readNullTerminatedString(buffer, cursor);
      if (!directory) {
        break;
      }

      while (true) {
        const fileName = readNullTerminatedString(buffer, cursor);
        if (!fileName) {
          break;
        }

        const crc = readUInt32(buffer, cursor);
        const preloadBytes = readUInt16(buffer, cursor);
        const archiveIndex = readUInt16(buffer, cursor);
        const entryOffset = readUInt32(buffer, cursor);
        const entryLength = readUInt32(buffer, cursor);
        const terminator = readUInt16(buffer, cursor);

        if (terminator !== 0xffff) {
          throw new Error(`Unexpected VPK entry terminator: ${terminator}`);
        }

        cursor.offset += preloadBytes;

        const normalizedDirectory = directory === ' ' ? '' : `${directory}/`;
        const normalizedExtension = extension === ' ' ? '' : `.${extension}`;

        entries.push({
          path: `${normalizedDirectory}${fileName}${normalizedExtension}`,
          directory: directory === ' ' ? '' : directory,
          fileName,
          extension: extension === ' ' ? '' : extension,
          crc,
          preloadBytes,
          archiveIndex,
          entryOffset,
          entryLength,
        });
      }
    }
  }

  return {
    signature,
    version,
    treeSize,
    entries,
  };
}

module.exports = {
  parseVpkDirectory,
};
