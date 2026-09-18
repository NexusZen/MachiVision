"""Stream official FlyWire CSV tables into SQLite without loading all edges into RAM."""
import argparse, csv, gzip, sqlite3
from pathlib import Path

def rows(path):
    opener=gzip.open if str(path).endswith('.gz') else open
    with opener(path,'rt',newline='',encoding='utf-8-sig') as f:
        yield from csv.DictReader(f)

def main():
    p=argparse.ArgumentParser();p.add_argument('--neurons',required=True);p.add_argument('--connections',required=True);p.add_argument('--output',default='data/processed/connectome.sqlite');p.add_argument('--source',required=True)
    args=p.parse_args();Path(args.output).parent.mkdir(parents=True,exist_ok=True)
    db=sqlite3.connect(args.output)
    db.executescript('CREATE TABLE IF NOT EXISTS neurons(id TEXT PRIMARY KEY,cell_type TEXT,region TEXT,hemisphere TEXT,nt TEXT,super_class TEXT); CREATE TABLE IF NOT EXISTS edges(pre TEXT,post TEXT,synapses INTEGER,neuropil TEXT); CREATE TABLE IF NOT EXISTS metadata(source TEXT);')
    if db.execute('SELECT count(*) FROM neurons').fetchone()[0]: raise ValueError('Output already contains neurons. Choose a new output file.')
    with db:
        db.execute('INSERT INTO metadata VALUES (?)',(args.source,))
        for n in rows(args.neurons):
            if 'root_id' not in n: raise ValueError('Neuron CSV requires root_id')
            db.execute('INSERT INTO neurons VALUES (?,?,?,?,?,?)',(n['root_id'],n.get('cell_type') or None,n.get('brain_region') or 'Unavailable',n.get('side') or 'Unavailable',n.get('nt_type') or None,n.get('super_class') or None))
        for e in rows(args.connections):
            if not all(k in e for k in ('pre_root_id','post_root_id','syn_count')): raise ValueError('Expected pre_root_id, post_root_id, syn_count in connections')
            db.execute('INSERT INTO edges VALUES (?,?,?,?)',(e['pre_root_id'],e['post_root_id'],int(e['syn_count']),e.get('neuropil')))
        db.executescript('CREATE INDEX IF NOT EXISTS edges_pre ON edges(pre); CREATE INDEX IF NOT EXISTS edges_post ON edges(post);')
    print('Imported',db.execute('SELECT count(*) FROM neurons').fetchone()[0],'neurons; IDs preserved as text')
    db.close()

if __name__=='__main__': main()
