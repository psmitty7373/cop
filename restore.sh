#!/bin/sh

echo "Restore which backup? YYYYMMDD:"
read DATE

MONGOFILE=ctfcop.mongo.${DATE}

tar zxvf backups/${MONGOFILE}.tar.gz
mongorestore dump
rm -rf dump
