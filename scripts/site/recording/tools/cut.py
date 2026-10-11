# cut.py <rec dir> <from mark> <to mark> [skip-from,skip-to ...] - frame paths between two marks, skipping ranges
import sys, csv, os
R = sys.argv[1]
fr = [(int(a), int(b)) for a, b in csv.reader(open(os.path.join(R, 'frames.csv')))]
mk = dict((a, int(b)) for a, b in csv.reader(open(os.path.join(R, 'marks.csv'))))
def t(name): return mk[name] if name in mk else (fr[0][1] if name == 'START' else fr[-1][1])
lo, hi = t(sys.argv[2]), t(sys.argv[3])
skips = [(t(s.split(",")[0]) - 400, t(s.split(",")[1]) + 1500) for s in sys.argv[4:]]
out = [f"{R}/{n:05d}.jpg" for n, ms in fr if lo <= ms <= hi and not any(a <= ms <= b for a, b in skips)]
print(' '.join(out))
