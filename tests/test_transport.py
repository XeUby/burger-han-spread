import unittest
from unittest.mock import patch
from spread.client import Client, Unreachable
from transport import ResilientClient

class TransportTests(unittest.TestCase):
    @patch('transport.time.sleep')
    def test_retries_failed_read(self, sleep):
        client=ResilientClient(url='https://example.com',key='test-only')
        with patch.object(Client,'call',side_effect=[Unreachable(0,'timeout'), {'ok':True}]) as call:
            self.assertEqual(client.call('GET','/v1/worlds'),{'ok':True})
            self.assertEqual(call.call_count,2)

    @patch('transport.time.sleep')
    def test_does_not_retry_unknown_mutation(self, sleep):
        client=ResilientClient(url='https://example.com',key='test-only')
        with patch.object(Client,'call',side_effect=Unreachable(0,'timeout')) as call:
            with self.assertRaises(Unreachable):
                client.call('POST','/v1/worlds',{'level':8})
            self.assertEqual(call.call_count,1)
            sleep.assert_not_called()

    @patch('transport.time.sleep')
    def test_read_retries_are_bounded(self, sleep):
        client=ResilientClient(url='https://example.com',key='test-only')
        with patch.object(Client,'call',side_effect=Unreachable(0,'timeout')) as call:
            with self.assertRaises(Unreachable): client.call('GET','/v1/worlds')
            self.assertEqual(call.call_count,4)
