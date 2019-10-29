#!/bin/sh
MONGOFILE=cop.mongo.`date +"%Y%m%d-%H%M%S"`

mongodump -d cop
tar zcvf backups/${MONGOFILE}.tar.gz dump
rm -rf dump
echo
echo "Backup finished: ./backups/$MONGOFILE.tar.gz"
