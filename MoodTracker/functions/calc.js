
export const formatDateKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

export function swingPercentage(moodData) {
	let swingSum = 0, consecutivePairs = 0;
	for (let i = 1; i < moodData.length; i++) {
		if (moodData[i].mood && moodData[i-1].mood && moodData[i].day - moodData[i-1].day === 1) {
			swingSum += Math.abs(moodData[i].mood - moodData[i-1].mood);
			consecutivePairs++;
		}
	}
	if (consecutivePairs === 0) return '-';
	return ((swingSum / consecutivePairs) * 100).toFixed(1) + '%';
}
export const getMonthAverageMood = (date, moodData) => {
	const d = date, y = d.getFullYear(), m = d.getMonth(), days = new Date(y, m + 1, 0).getDate();
	let sum = 0, cnt = 0;
	for (let i = 1; i <= days; i++) { const mood = moodData[formatDateKey(new Date(y, m, i))]; if (mood) sum += mood, cnt++; }
	return cnt ? Math.ceil(sum / cnt) : null;
};