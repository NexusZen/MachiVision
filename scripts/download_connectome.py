"""Download a specific official CSV resource; credentials are read from environment only."""
import argparse,os,urllib.request,urllib.parse,hashlib,json
from pathlib import Path

def main():
    p=argparse.ArgumentParser();p.add_argument('--product',choices=['consolidated_cell_types','connections_princeton'],required=True);a=p.parse_args()
    token=os.environ.get('CODEX_FLYWIRE_TOKEN')
    if not token:raise SystemExit('Set CODEX_FLYWIRE_TOKEN from your FlyWire Codex account. Never commit it.')
    url='https://codex.flywire.ai/api/download_resource?'+urllib.parse.urlencode(dict(dataset='fafb',data_product=a.product,api_token=token))
    directory=Path('data/raw');directory.mkdir(parents=True,exist_ok=True);target=directory/(a.product+'.csv.gz')
    digest=hashlib.sha256()
    try:
        with urllib.request.urlopen(url,timeout=120) as response,target.open('wb') as f:
            while block:=response.read(1024*1024):f.write(block);digest.update(block)
    except Exception:target.unlink(missing_ok=True);raise SystemExit('Download failed. Check token and official portal; URL omitted to protect credentials.')
    target.with_suffix('.manifest.json').write_text(json.dumps(dict(product=a.product,dataset='fafb',source='https://codex.flywire.ai/api/download?dataset=fafb',sha256=digest.hexdigest(),release='Verify selected release in official download portal before import'),indent=2))
    print('Saved',target,'Verify release and schema before import.')

if __name__=='__main__':main()
