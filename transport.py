"""Retry only reads; mutation recovery belongs to the runner."""
import time
from spread.client import Client, Unreachable

class ResilientClient(Client):
    def call(self, method, path, body=None, actions=0):
        for attempt in range(4):
            try:
                return super().call(method,path,body,actions)
            except Unreachable:
                if method != 'GET' or attempt == 3:
                    raise
                time.sleep(min(5, attempt+1))
