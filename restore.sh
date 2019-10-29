#!/bin/sh

echo "Restore which backup? YYYYMMDD-hhmmss:"
read DATE

MONGOFILE=cop.mongo.${DATE}

tar zxvf backups/${MONGOFILE}.tar.gz
mongorestore dump
rm -rf dump
