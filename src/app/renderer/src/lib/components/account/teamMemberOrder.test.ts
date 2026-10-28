import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeTeamMembers } from './teamMemberOrder'

test(`keeps the server order on the first member load`, () => {
	const incoming = [
		{ userId: 1, name: `Owner` },
		{ userId: 3, name: `Admin` },
		{ userId: 2, name: `Member` },
	]

	assert.deepEqual(mergeTeamMembers([], incoming).map(member => member.userId), [1, 3, 2])
})

test(`refreshes member data without moving existing members`, () => {
	const current = [
		{ userId: 1, name: `Owner` },
		{ userId: 2, name: `Member` },
		{ userId: 3, name: `Admin` },
	]
	const incoming = [
		{ userId: 3, name: `New admin name` },
		{ userId: 1, name: `Owner` },
		{ userId: 2, name: `New member name` },
	]

	assert.deepEqual(mergeTeamMembers(current, incoming), [
		{ userId: 1, name: `Owner` },
		{ userId: 2, name: `New member name` },
		{ userId: 3, name: `New admin name` },
	])
})

test(`removes departed members and appends newcomers in server order`, () => {
	const current = [
		{ userId: 1, name: `Owner` },
		{ userId: 2, name: `Former member` },
		{ userId: 3, name: `Member` },
	]
	const incoming = [
		{ userId: 4, name: `New admin` },
		{ userId: 3, name: `Member` },
		{ userId: 5, name: `New member` },
		{ userId: 1, name: `Owner` },
	]

	assert.deepEqual(mergeTeamMembers(current, incoming).map(member => member.userId), [1, 3, 4, 5])
})
