<script setup lang="ts">
import { computed, ref } from 'vue'
import Checkbox from 'primevue/checkbox'
import UiButton from '../../shared/ui/UiButton.vue'
import UiInput from '../../shared/ui/UiInput.vue'
import UiSelect from '../../shared/ui/UiSelect.vue'
import { createId } from '../../shared/lib/id'
import { usePlatformStore } from '../../stores/platform'
import type { Workflow, WorkflowState, WorkflowTransition } from '../../shared/types/domain'

const workflow = defineModel<Workflow>({ required: true })
const platform = usePlatformStore()
const selectedStateId = ref(workflow.value.states[0]?.id ?? '')
const selectedTransitionId = ref('')

const selectedState = computed(() => workflow.value.states.find((state) => state.id === selectedStateId.value))
const selectedTransition = computed(() => workflow.value.transitions.find((transition) => transition.id === selectedTransitionId.value))
const stateOptions = computed(() => workflow.value.states.map((state) => ({ label: state.name, value: state.id })))
const roleOptions = computed(() => platform.roles.map((role) => ({ label: role.name, value: role.id })))

function addState() {
  const state: WorkflowState = {
    id: createId('st'),
    code: `state_${workflow.value.states.length + 1}`,
    name: 'Новый статус',
    initial: false,
    final: false,
    x: 80 + workflow.value.states.length * 180,
    y: 180,
  }
  workflow.value.states.push(state)
  selectedStateId.value = state.id
  selectedTransitionId.value = ''
}

function addTransition() {
  const [from, to] = workflow.value.states
  if (!from || !to) return
  const transition: WorkflowTransition = {
    id: createId('tr'),
    name: 'Новое действие',
    fromStateId: from.id,
    toStateId: to.id,
    allowedRoleIds: ['role_manager'],
    validateRequiredFields: true,
    validateGeoRules: true,
  }
  workflow.value.transitions.push(transition)
  selectedTransitionId.value = transition.id
  selectedStateId.value = ''
}

function selectState(stateId: string) {
  selectedStateId.value = stateId
  selectedTransitionId.value = ''
}

function selectTransition(transitionId: string) {
  selectedTransitionId.value = transitionId
  selectedStateId.value = ''
}

function updateRoles(roleId: string, checked: boolean) {
  if (!selectedTransition.value) return
  selectedTransition.value.allowedRoleIds = checked
    ? [...selectedTransition.value.allowedRoleIds, roleId]
    : selectedTransition.value.allowedRoleIds.filter((id) => id !== roleId)
}
</script>

<template>
  <div class="workflow-builder">
    <div class="workflow-builder__toolbar">
      <UiButton label="State" icon="pi pi-plus" severity="secondary" variant="outlined" @click="addState" />
      <UiButton label="Transition" icon="pi pi-arrow-right" severity="secondary" variant="outlined" @click="addTransition" />
    </div>
    <div class="workflow-builder__body">
      <div class="workflow-canvas">
        <svg class="workflow-lines">
          <line
            v-for="transition in workflow.transitions"
            :key="transition.id"
            :x1="(workflow.states.find((state) => state.id === transition.fromStateId)?.x ?? 0) + 130"
            :y1="(workflow.states.find((state) => state.id === transition.fromStateId)?.y ?? 0) + 32"
            :x2="workflow.states.find((state) => state.id === transition.toStateId)?.x ?? 0"
            :y2="(workflow.states.find((state) => state.id === transition.toStateId)?.y ?? 0) + 32"
            stroke="#98a2b3"
            stroke-width="2"
            marker-end="url(#arrow)"
            @click="selectTransition(transition.id)"
          />
          <defs>
            <marker id="arrow" marker-width="10" marker-height="10" ref-x="7" ref-y="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="#98a2b3" />
            </marker>
          </defs>
        </svg>
      <button
          v-for="state in workflow.states"
          :key="state.id"
          type="button"
          class="workflow-node"
          :class="{ active: state.id === selectedStateId }"
          :style="{ left: `${state.x}px`, top: `${state.y}px` }"
          draggable="true"
          @click="selectState(state.id)"
          @dragend="state.x = $event.offsetX; state.y = $event.offsetY"
        >
          <strong>{{ state.name }}</strong>
        </button>
      </div>
      <aside class="panel stack">
        <template v-if="selectedState">
          <h3 class="surface-title">State</h3>
          <div class="form-field">
            <label>Название</label>
            <UiInput v-model="selectedState.name" />
          </div>
          <label><Checkbox v-model="selectedState.initial" binary /> Initial</label>
          <label><Checkbox v-model="selectedState.final" binary /> Final</label>
        </template>
        <template v-else-if="selectedTransition">
          <h3 class="surface-title">Transition</h3>
          <div class="form-field">
            <label>Название действия</label>
            <UiInput v-model="selectedTransition.name" />
          </div>
          <div class="form-field">
            <label>From</label>
            <UiSelect v-model="selectedTransition.fromStateId" :options="stateOptions" />
          </div>
          <div class="form-field">
            <label>To</label>
            <UiSelect v-model="selectedTransition.toStateId" :options="stateOptions" />
          </div>
          <div class="stack">
            <span class="muted">Allowed roles</span>
            <label v-for="role in roleOptions" :key="role.value">
              <Checkbox
                :model-value="selectedTransition.allowedRoleIds.includes(String(role.value))"
                binary
                @update:model-value="updateRoles(String(role.value), Boolean($event))"
              />
              {{ role.label }}
            </label>
          </div>
          <label><Checkbox v-model="selectedTransition.validateRequiredFields" binary /> Проверять обязательные поля</label>
          <label><Checkbox v-model="selectedTransition.validateGeoRules" binary /> Проверять Geo Rules</label>
        </template>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.workflow-builder,
.workflow-builder__body {
  display: grid;
  gap: 14px;
}

.workflow-builder__toolbar {
  display: flex;
  gap: 8px;
}

.workflow-builder__body {
  grid-template-columns: minmax(0, 1fr) 340px;
}

.workflow-canvas {
  position: relative;
  min-height: 380px;
  overflow: hidden;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background:
    linear-gradient(var(--color-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--color-border) 1px, transparent 1px),
    var(--color-surface);
  background-size: 28px 28px;
}

.workflow-lines {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.workflow-node {
  position: absolute;
  width: 140px;
  display: grid;
  gap: 4px;
  padding: 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  text-align: left;
  cursor: move;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.08);
}

.workflow-node.active {
  border-color: var(--color-accent);
}

.workflow-node span {
  color: var(--color-text-secondary);
  font-size: 12px;
}

label {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
