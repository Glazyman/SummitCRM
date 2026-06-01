import { redirect } from 'next/navigation'

// Batches have moved into the Tasks page under the Batches tab
export default function BatchesPage() {
  redirect('/tasks')
}
