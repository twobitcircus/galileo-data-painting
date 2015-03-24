#!/bin/bash

cd `dirname $0`
IP=`osascript -e "display dialog \"Enter the IP address of the Galileo\" default answer \"\"" -e "log text returned of result" 2>&1`

echo "IP is $IP"

echo "copying labserve to the galileo"
rsync -avrz --files-from=syncfiles ./ root@$IP:labserve
if [ $? -ne 0 ]
then
  echo "rsync not found, installing it"
  scp dependencies/rsync root@$IP:/usr/bin
  if [ $? -ne 0 ]
  then
    echo "installing rsync failed, exiting"
    exit 1;
  else
    echo "copying labserve to the galileo"
    rsync -avrz --files-from=syncfiles ./ root@$IP:labserve
    if [ $? -ne 0 ]
    then
      echo "rsync failed again, exiting"
    fi
  fi
fi

echo "launching labserve on the galileo"
ssh -f root@$IP 'sh -c "( (nohup labserve/run.sh 2>&1 >labserve.out </dev/null) & )"'
while :
do
  sleep 2
  echo "checking if labserve is running (be patient)"
  curl --silent -f --output /dev/null http://$IP:8080/
  if [ $? -eq 0 ]
  then
    break
  fi
done

echo "labserve is running"
echo "launching labserve editor at http://$IP:8080/pages/editor"

open http://$IP:8080/pages/editor
