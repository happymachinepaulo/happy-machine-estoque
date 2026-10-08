import unittest,io,os,json,urllib.error
from unittest.mock import patch
from test_security import api

class PhotoDelivery(unittest.TestCase):
 def test_missing_object_is_404_instead_of_bad_request(self):
  error=urllib.error.HTTPError('https://test.supabase.co/storage/v1/object/test',400,'Error',{},io.BytesIO(b'{"statusCode":"404","code":"NoSuchKey"}'))
  with patch.dict(os.environ,{'SUPABASE_URL':'https://test.supabase.co','SUPABASE_ANON_KEY':'test-public'}),patch.object(api.urllib.request,'urlopen',side_effect=error):
   with self.assertRaises(api.APIError) as result:api.remote('/storage/v1/object/test',raw=True)
  self.assertEqual(result.exception.status,404)
 def test_signed_urls_batch_requires_known_database_photos(self):
  h=object.__new__(api.handler);h.auth_token='verified-user'
  h.json_body=lambda:{'ids':[289,289,333]};h.respond=lambda value:value
  h.rows=lambda table,**query:[{'id':289,'storage_path':'migration/photo.jpg'}]
  with patch.dict(os.environ,{'SUPABASE_URL':'https://test.supabase.co','SUPABASE_ANON_KEY':'test-public'}),patch.object(api,'remote',return_value=[{'path':'migration/photo.jpg','signedURL':'/object/sign/stock-photos/migration/photo.jpg?token=temporary'}]) as remote:
   result=h.post('/api/photos/urls')
  self.assertEqual(list(result),['289'])
  self.assertEqual(remote.call_args.kwargs['token'],'verified-user')
  self.assertEqual(remote.call_args.args[2],{'paths':['migration/photo.jpg'],'expiresIn':600})
 def test_oversized_request_rejected_without_signing(self):
  h=object.__new__(api.handler);h.json_body=lambda:{'ids':list(range(501))}
  with patch.object(api,'remote') as remote:
   with self.assertRaises(api.APIError):h.post('/api/photos/urls')
  remote.assert_not_called()
