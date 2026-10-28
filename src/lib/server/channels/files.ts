/**
 * Files people send (photos, voice notes, documents) are kept per chat — a person's DMs
 * or the group — under `data/files/<thread>/`, so the agent and family can
 * find them later. Nothing here leaves the box.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';

const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'audio/ogg': 'ogg',
	'audio/mpeg': 'mp3',
	'audio/mp4': 'm4a',
	'application/pdf': 'pdf'
};

/** `wa:120…@g.us` → `wa-120…-g.us` — safe as a file or folder name. */
const folderOf = (threadId: string) => threadId.replace(/[^\w.-]+/g, '-');

export async function saveFile(
	threadId: string,
	messageId: string,
	mimetype: string,
	data: Buffer,
	/** The sender's file name, for its extension when the type isn't one we know. */
	fileName?: string
) {
	const dir = join('data', 'files', folderOf(threadId));
	await mkdir(dir, { recursive: true });
	const base = mimetype.split(';')[0].trim();
	const own = fileName?.match(/\.([A-Za-z0-9]{1,8})$/)?.[1]?.toLowerCase();
	const ext = EXT[base] ?? own ?? 'bin';
	const path = join(dir, `${Date.now()}-${folderOf(messageId)}.${ext}`);
	await writeFile(path, data);
	return path;
}

/** A PDF's text layer, read on the box. Empty for a scan. */
export async function pdfText(data: Buffer): Promise<string> {
	const pdf = await getDocumentProxy(new Uint8Array(data));
	const { text } = await extractText(pdf, { mergePages: true });
	return text.replace(/[ \t]+\n/g, '\n').trim();
}
