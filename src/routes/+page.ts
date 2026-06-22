// Redirect to scenarios/ddp/chatgpt page
import { redirect } from '@sveltejs/kit';

export function load() {
    throw redirect(302, '/scenarios/ddp/chatgpt');
}