export interface ClozeBlank {
	token: string;
	answer: string;
}

/** Remove the innermost Cloze wrappers first, preserving Markdown and nested answers. */
export function unwrapCloze(source: string): string {
	const pattern = /\{\{c\d+::?((?:(?!\{\{|\}\})[\s\S])*?)\}\}/g;
	let previous: string;
	do {
		previous = source;
		source = source.replace(pattern, (_match, content: string) => content.split('::')[0] ?? '');
	} while (source !== previous);
	return source;
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
