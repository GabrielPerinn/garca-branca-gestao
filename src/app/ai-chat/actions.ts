'use server'

import { interpretRuralMessage } from "@/lib/ai/interpreter"

export async function processChatAction(formData: FormData) {
  const message = formData.get('message') as string
  const imageFile = formData.get('image') as File

  let base64Image = undefined
  if (imageFile && imageFile.size > 0) {
    const buffer = await imageFile.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    base64Image = `data:${imageFile.type};base64,${base64}`
  }

  try {
    const result = await interpretRuralMessage(message, base64Image)
    return { success: true, result }
  } catch (error: any) {
    console.error("Chat Action Error:", error)
    return { success: false, error: error.message }
  }
}
