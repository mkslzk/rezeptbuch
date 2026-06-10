#!/bin/bash
NAME="moca-dev"
DESC="MOCA Development Server"
DIR="/home/openclaw/.openclaw/workspace/charlie/rezeptbuch/server"
LOG="/tmp/moca-dev.log"
PID_FILE="/tmp/moca-dev.pid"

start() {
  if [ -f $PID_FILE ] && kill -0 $(cat $PID_FILE) 2>/dev/null; then
    echo "$NAME already running (PID $(cat $PID_FILE))"
    return 1
  fi
  echo "Starting $NAME..."
  cd $DIR
  nohup node src/index.js > $LOG 2>&1 &
  echo $! > $PID_FILE
  sleep 2
  if kill -0 $(cat $PID_FILE) 2>/dev/null; then
    echo "$NAME started (PID $(cat $PID_FILE))"
  else
    echo "$NAME failed to start - check $LOG"
    return 1
  fi
}

stop() {
  if [ ! -f $PID_FILE ]; then
    echo "$NAME not running"
    return 1
  fi
  PID=$(cat $PID_FILE)
  echo "Stopping $NAME (PID $PID)..."
  kill $PID 2>/dev/null
  rm -f $PID_FILE
  echo "$NAME stopped"
}

status() {
  if [ -f $PID_FILE ] && kill -0 $(cat $PID_FILE) 2>/dev/null; then
    echo "$NAME running (PID $(cat $PID_FILE))"
    curl -s http://localhost:3001/recipe/api/health | head -1
  else
    echo "$NAME not running"
  fi
}

restart() {
  stop
  sleep 1
  start
}

case "$1" in
  start) start ;;
  stop) stop ;;
  restart) restart ;;
  status) status ;;
  *) echo "Usage: $0 {start|stop|restart|status}" ;;
esac
