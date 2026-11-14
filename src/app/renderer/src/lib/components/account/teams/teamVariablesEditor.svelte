<script lang="ts">
  import { slugVariableLabel, variableErrors, type TeamVariable } from '@spellbook/shared/teamVariables'
  import Input from '$lib/components/ui/Input.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import PanelHeader from '$lib/components/ui/PanelHeader.svelte'

  export let variables: TeamVariable[] = []
  export let disabled = false
  export let onChange: (variables: TeamVariable[]) => void

  let visited: boolean[] = []
  $: errors = variableErrors(variables)

  export function validate() {
    visited = variables.map(() => true)
  }

  function touch(index: number) {
    visited = variables.map((_, item) => item === index || Boolean(visited[item]))
  }

  function add() {
    visited = [...variables.map((_, index) => Boolean(visited[index])), false]
    onChange([...variables, { label: ``, key: ``, value: `` }])
  }

  function remove(index: number) {
    visited = variables.filter((_, item) => item !== index).map((_, item) => Boolean(visited[item < index ? item : item + 1]))
    onChange(variables.filter((_, item) => item !== index))
  }

  function change(index: number, update: Partial<TeamVariable>) {
    onChange(variables.map((variable, item) => item === index ? { ...variable, ...update } : variable))
  }
</script>

<section class="team-variables" aria-label="Team variables">
  <PanelHeader variant="section" title="Custom variables">
    <svelte:fragment slot="trailing"><Button label="Add variable" icon="fa-plus" {disabled} onClick={add} /></svelte:fragment>
  </PanelHeader>
  {#each variables as variable, index (index)}
    <div class="variable-row">
      <Input label="Name" value={variable.label} error={visited[index] ? errors[index] : null} hint={!errors[index] && variable.key ? `[${variable.key}]` : null} maxlength={64} placeholder="Rules URL" {disabled} onBlur={() => touch(index)} onChange={label => change(index, { label, key: slugVariableLabel(label) })} />
      <Input label="Value" value={variable.value} maxlength={255} {disabled} onChange={value => change(index, { value })} />
      <div class="variable-remove"><Button label="Remove" variant="danger" {disabled} onClick={() => remove(index)} /></div>
    </div>
  {:else}
    <small>No custom variables yet.</small>
  {/each}
  <small>Renaming a variable changes its tag. Messages using the old tag are not updated.</small>
</section>

<style lang="scss">
  .team-variables { min-width: 0; display: grid; gap: var(--gutter-lg); }
  .variable-row { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; grid-template-rows: auto var(--control-height-md) auto; align-items: start; gap: var(--gutter-sm) var(--gutter-md); }
  .variable-row :global(.ui-input) { grid-row: 1 / span 3; grid-template-rows: subgrid; }
  .variable-remove { grid-column: 3; grid-row: 2; }
  small { color: var(--color-light-secondary); font-size: var(--font-size-xs); }
  @media (max-width: 600px) {
    .variable-row { grid-template-columns: minmax(0, 1fr); grid-template-rows: none; }
    .variable-row :global(.ui-input) { grid-row: auto; grid-template-rows: none; }
    .variable-remove { grid-column: 1; grid-row: auto; }
  }
</style>
