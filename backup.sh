#!/bin/sh
MONGOFILE=ctfcop.mongo.`date +"%Y%m%d"`

mongodump -d ctfcop
tar zcvf backups/${MONGOFILE}.tar.gz dump
rm -rf dump
