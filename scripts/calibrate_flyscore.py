"""Calibrate the Python/OpenCV engine, never silently reuse for the browser estimator."""
import sys,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import numpy as np
import cv2
from backend.engine import DemoConnectomeAdapter,Simulator,extract,report

def main():
    graph=DemoConnectomeAdapter().load();scores=[]
    for speed in [0,1,2,4]:
        for radius in [5,12,24]:
            sim=Simulator(graph);previous=None;frames=[]
            for i in range(120):
                image=np.full((80,128,3),200,dtype=np.uint8);cv2.circle(image,(int((20+i*speed)%128),40),radius,(15,15,15),-1)
                f,previous=extract(image,previous,i*.05);frames.append(sim.step(f))
            scores.append(float(np.mean([f['score'] for f in frames])))
    result=dict(engine='opencv-farneback-v1',statistic='clip mean',reference_set='12 procedural moving-dot clips: 4 speeds × 3 radii; 6 seconds each',count=len(scores),sorted_scores=sorted(scores),fingerprint=report(frames,graph,{})['fingerprint'],note='Not a population norm; not compatible with browser block matching')
    target=Path('data/calibration/opencv-demo.json');target.parent.mkdir(parents=True,exist_ok=True);target.write_text(json.dumps(result,indent=2));print(target)

if __name__=='__main__':main()
