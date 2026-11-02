"""Keep the pinned test host, exact identity routes and public signers aligned."""
import json
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ANDROID = '{http://schemas.android.com/apk/res/android}'


class AndroidAppLinksTests(unittest.TestCase):
    def test_verified_filter_claims_only_the_five_https_identity_paths(self):
        manifest = ET.parse(ROOT / 'android/app/src/main/AndroidManifest.xml')
        filters = [node for node in manifest.iter('intent-filter')
                   if node.get(f'{ANDROID}autoVerify') == 'true']
        self.assertEqual(len(filters), 1)
        declarations = filters[0].findall('data')
        self.assertEqual({n.get(f'{ANDROID}scheme') for n in declarations if n.get(f'{ANDROID}scheme')}, {'https'})
        self.assertEqual({n.get(f'{ANDROID}host') for n in declarations if n.get(f'{ANDROID}host')}, {'demo.eimir.ur-cloud.de'})
        self.assertEqual({n.get(f'{ANDROID}path') for n in declarations if n.get(f'{ANDROID}path')},
                         {'/auth/signup', '/auth/magic-link', '/auth/invitation', '/auth/verify-email', '/auth/recovery'})
        self.assertFalse(any(f'{ANDROID}pathPrefix' in n.attrib or f'{ANDROID}pathPattern' in n.attrib for n in declarations))

    def test_public_association_has_the_actual_canonical_and_retained_signers(self):
        statements = json.loads((ROOT / 'web/public/.well-known/assetlinks.json').read_text())
        self.assertEqual(len(statements), 2)
        canonical = next(s for s in statements if s['target']['package_name'] == 'de.eimir.app')
        self.assertEqual(canonical['relation'], ['delegate_permission/common.handle_all_urls'])
        self.assertEqual(canonical['target']['namespace'], 'android_app')
        self.assertEqual([v.replace(':', '').lower() for v in canonical['target']['sha256_cert_fingerprints']],
                         ['1d403a18b4d3694f8e5fd9853906a60c012644d23e5a3a1ef40819b119cb1da9'])
        predecessor = next(s for s in statements if s is not canonical)
        self.assertEqual([v.replace(':', '').lower() for v in predecessor['target']['sha256_cert_fingerprints']],
                         ['b5009739477874fbc76b483c66ddb1502132255dd15de37f7570ee6a13b5f472'])

    def test_nginx_serves_json_only_for_the_requested_host_without_spa_fallback(self):
        config = (ROOT / 'web/nginx.conf').read_text()
        location = config.split('location = /.well-known/assetlinks.json {', 1)[1].split('\n    }', 1)[0]
        self.assertIn('if ($host != demo.eimir.ur-cloud.de) { return 404; }', location)
        self.assertIn('default_type application/json;', location)
        self.assertIn('try_files $uri =404;', location)
        self.assertNotIn('index.html', location)


if __name__ == '__main__':
    unittest.main()
