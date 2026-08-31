export interface ClozeBlank {
	token: string;
	answer: string;
}

export function prepareClozeMarkdown(source: string): {
	markdown: string;
	pattern: RegExp;
	blanks: ClozeBlank[];
} {
	let prefix = 'ANKICLOZETOKEN';
	while (source.includes(prefix)) prefix += 'X';
	const blanks: ClozeBlank[] = [];
	const markdown = source.replace(/\{\{c\d+::?([\s\S]*?)\}\}/g, (_match, content: string) => {
		const token = `${prefix}${blanks.length}END`;
		// Standard Anki hints follow a second double-colon; the answer omits the hint.
		blanks.push({ token, answer: content.split('::')[0] ?? '' });
		return token;
	});
	return { markdown, pattern: new RegExp(`${prefix}(\\d+)END`, 'g'), blanks };
}
