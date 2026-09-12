package io.github.ikasast.voxinq

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// The stored address is also the one origin the page bridge answers to, so it has to come out
// as exactly `scheme://host[:port]` however it was typed.
class ServerAddressTest {
    @Test
    fun aBareHostMeansHttps() {
        assertEquals("https://meetings.example.ts.net", ServerAddress.normalize("meetings.example.ts.net"))
    }

    @Test
    fun aPathAndTheDefaultPortAreDropped() {
        assertEquals("https://meetings.example.ts.net", ServerAddress.normalize("https://Meetings.Example.ts.net:443/abc/recording?x=1"))
    }

    @Test
    fun aPortThatIsNotTheDefaultIsKept() {
        assertEquals("http://localhost:3100", ServerAddress.normalize(" http://localhost:3100/ "))
        assertEquals("https://10.0.0.5:8443", ServerAddress.normalize("10.0.0.5:8443"))
    }

    @Test
    fun anythingElseIsRefused() {
        assertNull(ServerAddress.normalize(""))
        assertNull(ServerAddress.normalize("two words"))
        assertNull(ServerAddress.normalize("ftp://example.com"))
        assertNull(ServerAddress.normalize("https://user:secret@example.com"))
        assertNull(ServerAddress.normalize("https://"))
    }

    @Test
    fun theOriginOfAPageIsItsServer() {
        assertEquals("https://example.com", ServerAddress.originOf("https://example.com/abc/recording"))
        assertNull(ServerAddress.originOf("about:blank"))
        assertNull(ServerAddress.originOf(null))
    }
}
