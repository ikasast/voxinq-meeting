package io.github.ikasast.voxinq

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TailscaleTest {
    @Test
    fun a_tailnet_address_is_a_magicdns_name_or_in_the_cgnat_range() {
        assertTrue(Tailscale.onTailnet("voxinq.example-tailnet.ts.net"))
        assertTrue(Tailscale.onTailnet("VOXINQ.EXAMPLE.TS.NET."))
        assertTrue(Tailscale.onTailnet("100.64.0.1"))
        assertTrue(Tailscale.onTailnet("100.127.255.254"))
        assertFalse(Tailscale.onTailnet("100.63.0.1"))
        assertFalse(Tailscale.onTailnet("100.128.0.1"))
        assertFalse(Tailscale.onTailnet("192.168.1.10"))
        assertFalse(Tailscale.onTailnet("localhost"))
        assertFalse(Tailscale.onTailnet("ts.net.example.com"))
        assertFalse(Tailscale.onTailnet("100.64.0"))
        assertFalse(Tailscale.onTailnet(null))
    }
}
