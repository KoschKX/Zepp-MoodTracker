function makeTargets(nDots, nInterps) {
  const dots = [];
  const interps = [];
  // produce increasing x values with some overlap
  let x = 0;
  for (let i = 0; i < nDots; i++) {
    x += Math.random() * 5 + 1;
    dots.push({ dot: {}, props: { x } });
    // occasionally add interp(s) between dots
    if (Math.random() > 0.3 && interps.length < nInterps) {
      const num = Math.min(3, nInterps - interps.length);
      for (let j = 0; j < num; j++) {
        const ix = x - (Math.random() * 3);
        interps.push({ dot: {}, props: { x: ix } });
      }
    }
  }
  // pad remaining interps
  while (interps.length < nInterps) {
    x += Math.random() * 5 + 0.5;
    interps.push({ dot: {}, props: { x } });
  }
  // Shuffle a bit to simulate real data ordering (but keep mostly ordered)
  return { dots, interps };
}

function oldApproach(dots, interps) {
  const filteredDots = dots.filter(t => t && t.dot && t.props).map(t => Object.assign({ type: 'dot' }, t));
  const filteredInterps = interps.filter(t => t && t.dot && t.props).map(t => Object.assign({ type: 'interp' }, t));
  const combined = filteredDots.concat(filteredInterps).sort((a, b) => {
    const ax = (a.props && typeof a.props.x === 'number') ? a.props.x : 0;
    const bx = (b.props && typeof b.props.x === 'number') ? b.props.x : 0;
    if (ax === bx) return (a.type === 'interp' && b.type === 'dot') ? -1 : (a.type === 'dot' && b.type === 'interp') ? 1 : 0;
    return ax - bx;
  });
  return combined;
}

function newApproach(dots, interps) {
  const filteredDots = dots; // assume left-to-right
  const filteredInterps = interps;
  const combined = [];
  let di = 0, ii = 0;
  while (di < filteredDots.length || ii < filteredInterps.length) {
    const d = filteredDots[di];
    const it = filteredInterps[ii];
    const dx = d && d.dot && d.props && typeof d.props.x === 'number' ? d.props.x : Number.POSITIVE_INFINITY;
    const ix = it && it.dot && it.props && typeof it.props.x === 'number' ? it.props.x : Number.POSITIVE_INFINITY;
    if (ix <= dx) {
      if (it && it.dot && it.props) combined.push(Object.assign({ type: 'interp' }, it));
      ii++;
    } else {
      if (d && d.dot && d.props) combined.push(Object.assign({ type: 'dot' }, d));
      di++;
    }
  }
  return combined;
}

function bench(sizeDots, sizeInterps, iterations) {
  const { dots, interps } = makeTargets(sizeDots, sizeInterps);
  // Warm up
  oldApproach(dots, interps);
  newApproach(dots, interps);

  const startOld = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) oldApproach(dots, interps);
  const endOld = process.hrtime.bigint();

  const startNew = process.hrtime.bigint();
  for (let i = 0; i < iterations; i++) newApproach(dots, interps);
  const endNew = process.hrtime.bigint();

  const oldMs = Number(endOld - startOld) / 1e6;
  const newMs = Number(endNew - startNew) / 1e6;
  return { sizeDots, sizeInterps, iterations, oldMs, newMs };
}

function runAll() {
  const sizes = [ {d:10,i:10}, {d:31,i:90}, {d:100,i:150}, {d:300,i:900} ];
  for (const s of sizes) {
    const iters = 5000;
    const r = bench(s.d, s.i, iters);
    console.log(`dots=${r.sizeDots} interps=${r.sizeInterps} iters=${r.iterations} => old: ${r.oldMs.toFixed(2)}ms, new: ${r.newMs.toFixed(2)}ms`);
  }
}

runAll();
