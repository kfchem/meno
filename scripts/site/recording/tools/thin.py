# thin.py <list> <most> - a frame list evenly thinned to at most <most> frames, one path a line
import sys
frames = [x for x in open(sys.argv[1]).read().split("\n") if x]
n = min(int(sys.argv[2]), len(frames))
print("\n".join(frames[round(i * (len(frames) - 1) / (n - 1))] for i in range(n)))
