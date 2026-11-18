package com.lunamusync.admin

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class SessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("luna_admin_session", Context.MODE_PRIVATE)
    var serverUrl: String?
        get() = preferences.getString("server", null)?.removeSuffix("/")
        private set(value) = preferences.edit().putString("server", value).apply()
    val cookie: String? get() = preferences.getString("credential", null)?.let(::decrypt)
    val connected: Boolean get() = serverUrl != null && cookie != null

    fun save(url: String, cookie: String) {
        serverUrl = url.removeSuffix("/")
        preferences.edit().putString("credential", encrypt(cookie)).apply()
    }

    fun clear() = preferences.edit().clear().apply()

    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("luna_session_key", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(KeyGenParameterSpec.Builder("luna_session_key", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build())
            generateKey()
        }
    }

    private fun encrypt(value: String): String {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val bytes = cipher.doFinal(value.toByteArray(Charsets.UTF_8))
        return "${Base64.encodeToString(cipher.iv, Base64.NO_WRAP)}:${Base64.encodeToString(bytes, Base64.NO_WRAP)}"
    }

    private fun decrypt(value: String): String? = runCatching {
        val (iv, content) = value.split(":", limit = 2)
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)))
        String(cipher.doFinal(Base64.decode(content, Base64.NO_WRAP)), Charsets.UTF_8)
    }.getOrNull()
}
